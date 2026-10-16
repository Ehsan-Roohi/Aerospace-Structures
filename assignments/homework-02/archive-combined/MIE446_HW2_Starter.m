%% MIE 446 HW2 -- Flight-Control Forces, Moments, and Structural Load Paths
% Student starter. Complete every TODO; do not replace unknowns with zero.
% Read the matching numbered steps in MIE446_HW2_Control_Forces_Moments.pdf.
% All calculations use SI units except control deflections, in degrees.
% Parts 2-4: +x forward, +y aircraft right, +z down; moments about the CG.
% Part 5: H is a supplied local resisting torque about the mechanism pivot.
% Run this setup first, then use Run Section in the MATLAB Editor.
% No add-on toolbox is needed. NaN means an unfinished answer, not zero.
clear; close all; clc;
format long g;                     % retain precision when comparing with Excel
scriptFolder = fileparts(mfilename('fullpath'));
if isempty(scriptFolder), scriptFolder = pwd; end
outputFolder = fullfile(scriptFolder, 'hw2_outputs');
if ~exist(outputFolder, 'dir'), mkdir(outputFolder); end
fprintf('Outputs will be written to: %s\n', outputFolder);

%% 0. Practice examples -- completed, not assessed data
s_demo = [0; 0.2; 0.4];             % m
f_demo = [0; 3; 6];                 % N/m
F_demo = trapz(s_demo, f_demo);     % integral is 1.2 N
fprintf('Practice trapezoid result: %.3f N\n', F_demo);
r_demo = [0.20, 0, 0];             % m; ROW vector
F_point_demo = [0, 0, 3];          % N; ROW vector
M_demo = cross(r_demo, F_point_demo);
fprintf('Practice moment: [%.3f %.3f %.3f] N m\n', M_demo);
% Expected practice moment = [0 -0.6 0] N m. Order is cross(r,F).

%% 2A. Inputs and station grid -- supplied
rho = 1.225;                       % kg/m^3
V = 15;                            % m/s; baseline speed
halfSpan = 0.450;                   % m
rootChord = 0.160; tipChord = 0.100; % m
activation = 0.300;                 % m
lossCoefficient = 0.30;             % dimensionless, illustrative
dragCoefficient = 0.10;             % dimensionless, illustrative
N = 90;                            % intervals; N+1 stations
s = linspace(0, halfSpan, N+1).';    % column vector, 91 by 1

%% 2B. Build the distributed force increments -- TODO
q = NaN;                           % TODO: 0.5*rho*V^2; units Pa
c = NaN(size(s));                   % TODO: chord c(s), m
g = NaN(size(s));                   % TODO: max(0,(s-activation)/(halfSpan-activation))
fz = NaN(size(s));                  % TODO: q*c*lossCoefficient*g, ELEMENTWISE
fx = NaN(size(s));                  % TODO: negative q*c*dragCoefficient*g
mxDensity = NaN(size(s));           % TODO: s .* fz; units N
mzDensity = NaN(size(s));           % TODO: -s .* fx; units N
% Replace each complete RHS above. Keep semicolons to avoid 91-line dumps.
% Use .* between two vectors. Use ./ and .^ for vector division/powers.
% A scalar times a vector may use *; two station vectors need .* here.

%% 2C. Integrate and export the baseline -- TODO
Fz = NaN;                          % TODO: trapz(s,fz), N
Fx = NaN;                          % TODO: integrate fx, N
Mx = NaN;                          % TODO: integrate mxDensity, N m
Mz = NaN;                          % TODO: integrate mzDensity, N m
baseline = [Fz, Fx, Mx, Mz];
if all(isfinite([q; c; g; fz; fx; mxDensity; mzDensity])) && all(isfinite(baseline))
    assert(iscolumn(s) && isequal(size(s),size(c),size(g),size(fz),size(fx)), ...
        'Use equally sized column vectors for every station quantity.');
    assert(all(diff(s)>0), 'Stations must increase from root to tip.');
    assert(all(g>=0 & g<=1), 'Check activation function bounds.');
    assert(all(fz>=0) && all(fx<=0), 'Check the declared increment signs.');
    wingTable = table(s,c,g,fz,fx,mxDensity,mzDensity, 'VariableNames', ...
        {'s_m','chord_m','g','Delta_fz_N_per_m','Delta_fx_N_per_m', ...
        'roll_integrand_N','yaw_integrand_N'});
    disp(table(Fz,Fx,Mx,Mz,'VariableNames',{'DeltaFz_N','DeltaFx_N','DeltaMx_Nm','DeltaMz_Nm'}));
    writetable(table(Fz,Fx,Mx,Mz,'VariableNames', ...
        {'DeltaFz_N','DeltaFx_N','DeltaMx_Nm','DeltaMz_Nm'}), ...
        fullfile(outputFolder,'Q2_baseline_totals.csv'));
    fprintf('Full-precision baseline [Fz Fx Mx Mz]: %.15g %.15g %.15g %.15g\n',baseline);
    writetable(wingTable, fullfile(outputFolder,'Q2_baseline_stations.csv'));
    figure('Color','w');
    subplot(3,1,1); plot(s,c,'k-','LineWidth',1.5); ylabel('Chord (m)'); grid on;
    subplot(3,1,2); plot(s,fz,'k-','LineWidth',1.5); ylabel('Delta f_z (N/m)'); grid on;
    subplot(3,1,3); plot(s,fx,'k-','LineWidth',1.5); ylabel('Delta f_x (N/m)');
    xlabel('Distance along right half-wing, s (m)'); grid on;
    set(findall(gcf,'-property','FontName'),'FontName','Times New Roman');
    set(findall(gcf,'Type','axes'),'XColor','k','YColor','k');
    print(gcf,fullfile(outputFolder,'Q2_spanwise_loads.png'),'-dpng','-r200');
else
    fprintf('Q2 baseline incomplete: replace NaN entries in Sections 2B and 2C.\n');
end

%% 2D. Refine the grid -- TODO: recompute, do not reuse 91-entry arrays
Nfine = 180;
sFine = linspace(0,halfSpan,Nfine+1).';
cFine = NaN(size(sFine));           % TODO: same chord law on sFine
gFine = NaN(size(sFine));           % TODO: same activation law on sFine
fzFine = NaN(size(sFine));          % TODO: load law at V=15 m/s
fxFine = NaN(size(sFine));          % TODO: load law at V=15 m/s
fine = NaN(1,4);                    % TODO: [DeltaFz DeltaFx DeltaMx DeltaMz]
% Use trapz(sFine,...) four times to build fine, in the same order as baseline.
relativeChangePercent = NaN(1,4);   % TODO: 100*abs(fine-baseline)./abs(fine)
if all(isfinite([baseline, fine, relativeChangePercent]))
    convergenceTable = table({'DeltaFz_N';'DeltaFx_N';'DeltaMx_Nm';'DeltaMz_Nm'}, ...
        baseline.',fine.',relativeChangePercent.', 'VariableNames', ...
        {'Quantity','N90','N180','Change_percent'});
    disp(convergenceTable);
    writetable(convergenceTable, fullfile(outputFolder,'Q2_convergence.csv'));
else
    fprintf('Q2 refinement incomplete: recompute all fine-grid arrays and four integrals.\n');
end

%% 2E. Speed study -- TODO: keep geometry, coefficients and N=90 fixed
speeds = [10; 15; 20];
speedResults = NaN(3,4);            % cols: [DeltaFz DeltaFx DeltaMx DeltaMz]
for j = 1:numel(speeds)
    qj = NaN;                      % TODO: dynamic pressure using speeds(j)
    fzj = NaN(size(s));             % TODO: load law using qj
    fxj = NaN(size(s));             % TODO: load law using qj
    speedResults(j,:) = NaN(1,4);   % TODO: four integrals using trapz(s,...)
end
if all(isfinite(speedResults(:)))
    speedTable = array2table([speeds,speedResults], 'VariableNames', ...
        {'V_m_per_s','DeltaFz_N','DeltaFx_N','DeltaMx_Nm','DeltaMz_Nm'});
    disp(speedTable);
    writetable(speedTable,fullfile(outputFolder,'Q2_speed_study.csv'));
else
    fprintf('Q2 speed study incomplete: complete the four TODOs inside the loop.\n');
end

%% 3. A lateral force at three locations -- TODO
rCases = [0,0.35,0; -0.15,0.35,0.04; -0.15,0.35,-0.04]; % m
Fside = [0,2,0];                    % N
sideMoments = NaN(3,3);             % rows A/B/C; cols Mx/My/Mz in N m
for j = 1:3
    sideMoments(j,:) = NaN(1,3);    % TODO: cross(rCases(j,:),Fside)
end
if all(isfinite(sideMoments(:)))
    sideTable = array2table([rCases,sideMoments], 'VariableNames', ...
        {'x_m','y_m','z_m','Mx_Nm','My_Nm','Mz_Nm'});
    disp(sideTable);
    writetable(sideTable,fullfile(outputFolder,'Q3_side_force.csv'));
else
    fprintf('Q3 incomplete: fill the cross-product expression after predicting signs.\n');
end

%% 4A. Elevon mixing and limits -- TODO; positive deflection = trailing edge up
commands = [8,0; 0,5; 8,5; 12,8];  % columns P and R in deg
limit = 15;                        % deg; symmetric actuator limit
k = 0.05;                          % N/deg, instructional force gain
rLeft = [-0.15,-0.35,0];           % m
rRight = [-0.15,0.35,0];           % m
requested = NaN(4,2);              % columns [left right], deg
achieved = NaN(4,2);               % columns [left right], deg
requestedMoments = NaN(4,3);        % cols [Mx My Mz], N m
achievedMoments = NaN(4,3);
for j = 1:4
    P = commands(j,1); R = commands(j,2);
    requested(j,:) = NaN(1,2);     % TODO: [P-R, P+R]
    achieved(j,:) = NaN(1,2);      % TODO: min(max(requested(j,:),-limit),limit)
    FLeftRequest = NaN(1,3);       % TODO: [0,0,k*requested(j,1)]
    FRightRequest = NaN(1,3);      % TODO: right counterpart
    FLeftAchieved = NaN(1,3);      % TODO: use achieved(j,1)
    FRightAchieved = NaN(1,3);     % TODO: use achieved(j,2)
    requestedMoments(j,:) = NaN(1,3); % TODO: sum cross(rLeft,FLeftRequest) + right
    achievedMoments(j,:) = NaN(1,3);  % TODO: same calculation after limits
end

%% 4B. Recover mixed command channels and plot -- TODO
Pachieved = NaN(4,1);              % TODO: (achieved(:,1)+achieved(:,2))/2
Rachieved = NaN(4,1);              % TODO: (achieved(:,2)-achieved(:,1))/2
if all(isfinite([requested(:);achieved(:);requestedMoments(:); ...
        achievedMoments(:);Pachieved;Rachieved]))
    assert(all(abs(achieved(:))<=limit), 'A limited deflection exceeds the limit.');
    elevonTable = array2table([commands,requested,achieved,Pachieved,Rachieved, ...
        requestedMoments,achievedMoments], 'VariableNames', ...
        {'P_deg','R_deg','Left_request_deg','Right_request_deg', ...
        'Left_limited_deg','Right_limited_deg','P_recovered_deg','R_recovered_deg', ...
        'Mx_request_Nm','My_request_Nm','Mz_request_Nm', ...
        'Mx_limited_Nm','My_limited_Nm','Mz_limited_Nm'});
    disp(elevonTable);
    writetable(elevonTable,fullfile(outputFolder,'Q4_elevon_mixing.csv'));
    figure('Color','w');
    bars = bar([requested(4,:).',achieved(4,:).'],'grouped');
    set(bars(1),'FaceColor','w','EdgeColor','k');
    set(bars(2),'FaceColor',[0.65 0.65 0.65],'EdgeColor','k');
    set(gca,'XColor','k','YColor','k');
    set(gca,'XTickLabel',{'Left','Right'}); ylabel('Local deflection (deg)');
    legend('Requested','After limit','Location','best');
    title('Case 4: actuator limits'); grid on;
    set(findall(gcf,'-property','FontName'),'FontName','Times New Roman');
    print(gcf,fullfile(outputFolder,'Q4_actuator_limits.png'),'-dpng','-r200');
else
    fprintf('Q4 incomplete: fill mixer, force, cross-product and recovered-channel TODOs.\n');
end

%% 5. Local mechanism torque and string tension -- TODO
H = 0.12;                          % N m; PROVIDED local resisting torque
d = [0.010;0.020;0.030];            % m; perpendicular moment arms
T = NaN(size(d));                   % TODO: H ./ d, N
if all(isfinite(T))
    tensionTable = table(d,T,'VariableNames',{'Perpendicular_arm_m','String_tension_N'});
    disp(tensionTable);
    writetable(tensionTable,fullfile(outputFolder,'Q5_local_tension.csv'));
else
    fprintf('Q5 incomplete: use local torque and PERPENDICULAR arm, in metres.\n');
end

%% Submission reminder
fprintf(['Save this completed .m file, your completed Excel workbook, and your own PDF report.\n' ...
    'Document team cross-checks and include your independently written reflection.\n' ...
    'Include the standard Claim-Evidence-Check slide (PPTX and PDF), README and AI-use note.\n' ...
    'Use Part 2 for the Engineering Judgment Record, as explained in the handout.\n' ...
    'A script that runs with unfinished NaN entries is not a completed assignment.\n']);
